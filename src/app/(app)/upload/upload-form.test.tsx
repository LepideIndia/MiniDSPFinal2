// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import UploadForm from "./upload-form";

const fetchMock = vi.fn();
beforeEach(() => {
  router.replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const saved = (over: Record<string, unknown> = {}) => ({ scanId: "s1", filename: "data.csv", risk: "None", findingCount: 0, findings: [], ...over });

function choose(name = "data.csv", content = "a,b\n1,2\n") {
  const input = screen.getByLabelText(/File \(\.csv or \.txt/) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([content], name, { type: "text/csv" })] } });
  return input;
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Scan file|Scanning/ }));

const REJECTIONS: [string, number, string, string][] = [
  ["empty", 400, "empty_file", "The file is empty."],
  ["too large", 413, "file_too_large", "The file is larger than 1 MiB."],
  ["wrong type", 415, "unsupported_extension", "Only .csv and .txt files are supported."],
  ["binary", 415, "binary_content", "The file does not look like plain text."],
  ["bad encoding", 415, "invalid_encoding", "The file must be valid UTF-8 text."],
  ["save failed", 500, "save_failed", "The scan could not be saved."],
];

describe("UploadForm: form", () => {
  it("has a labelled file input restricted to .csv/.txt and a described hint", () => {
    render(<UploadForm />);
    const input = screen.getByLabelText(/File \(\.csv or \.txt/) as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".csv,.txt");
    expect(input.getAttribute("aria-describedby")).toBe("upload-hint");
    expect(document.getElementById("upload-hint")?.textContent).toMatch(/Synthetic data only/);
  });

  it("asks for a file before calling the server", () => {
    render(<UploadForm />);
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Choose a non-empty .csv or .txt file.");
  });
});

describe("UploadForm: errors are shown accessibly", () => {
  it.each(REJECTIONS)("%s (%i) -> role=alert with the server's generic message", async (_n, status, code, message) => {
    fetchMock.mockResolvedValue(json(status, { error: code, message }));
    render(<UploadForm />);
    choose();
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("lp-message--error");
    expect(alert.textContent).toContain("Upload failed");
    expect(alert.textContent).toContain(message);
    expect(screen.queryByText("Scan saved")).toBeNull();
  });

  it("falls back to a fixed message for an unexpected response and never echoes it", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Internal Server Error at /secret/path alex@example.test</html>", { status: 502 }));
    const { container } = render(<UploadForm />);
    choose();
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The upload failed. Try again.");
    expect(container.textContent).not.toMatch(/secret|alex@|Internal Server/);
  });

  it("ignores an over-long message from the server", async () => {
    fetchMock.mockResolvedValue(json(500, { message: "x".repeat(500) }));
    render(<UploadForm />);
    choose();
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("The upload failed. Try again.");
  });

  it("shows the fallback when the network fails, without the network error text", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.1"));
    const { container } = render(<UploadForm />);
    choose();
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("The upload failed. Try again.");
    expect(container.textContent).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
  });

  it("sends the user to sign-in on 401 without showing an error", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "unauthorized", message: "Sign in to upload files." }));
    render(<UploadForm />);
    choose();
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears an old error when the next upload succeeds", async () => {
    fetchMock.mockResolvedValueOnce(json(415, { message: "Only .csv and .txt files are supported." }));
    fetchMock.mockResolvedValueOnce(json(200, saved()));
    render(<UploadForm />);
    choose();
    submit();
    await screen.findByRole("alert");
    submit();
    await screen.findByText("Scan saved");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("UploadForm: progress and success", () => {
  it("disables the button and shows a labelled spinner while scanning", async () => {
    let finish!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    render(<UploadForm />);
    choose();
    submit();
    const button = await screen.findByRole("button", { name: /Scanning/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(within(button).getByRole("status").textContent).toContain("Scanning");
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    finish(json(200, saved()));
    await screen.findByText("Scan saved");
    expect((screen.getByRole("button", { name: "Scan file" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("posts the file as multipart form data to /api/scan", async () => {
    fetchMock.mockResolvedValue(json(200, saved()));
    render(<UploadForm />);
    choose("data.csv", "a,b\n");
    submit();
    await screen.findByText("Scan saved");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/scan");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("shows overall risk and masked findings as text on success", async () => {
    fetchMock.mockResolvedValue(
      json(
        200,
        saved({
          filename: "mixed.csv",
          risk: "Critical",
          findingCount: 3,
          findings: [
            { type: "Payment Card", risk: "Critical", matchCount: 1, maskedExample: "**** **** **** 1111" },
            { type: "Email", risk: "Low", matchCount: 2, maskedExample: "a***@example.test" },
          ],
        }),
      ),
    );
    const { container } = render(<UploadForm />);
    choose("mixed.csv");
    submit();
    await screen.findByText("Results for mixed.csv");
    expect(screen.getByText("3 matches found.")).toBeTruthy();
    const rows = within(screen.getByRole("region", { name: "Scan results table" })).getAllByRole("row");
    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Payment Card", "Critical", "1", "**** **** **** 1111"]);
    expect(within(rows[2]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Email", "Low", "2", "a***@example.test"]);
    expect(screen.getByRole("link", { name: "View all findings" }).getAttribute("href")).toBe("/findings");
    expect(container.textContent).not.toMatch(/alex@|4111 1111/);
  });

  it("says so when nothing sensitive was found", async () => {
    fetchMock.mockResolvedValue(json(200, saved({ filename: "clean.csv" })));
    render(<UploadForm />);
    choose("clean.csv");
    submit();
    await screen.findByText("No sensitive data was found.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders a hostile filename in the result as plain text", async () => {
    const hostile = "<img src=x onerror=alert(1)>.csv";
    fetchMock.mockResolvedValue(json(200, saved({ filename: hostile })));
    const { container } = render(<UploadForm />);
    choose();
    submit();
    await screen.findByText(`Results for ${hostile}`);
    expect(container.querySelector("img")).toBeNull();
  });
});
