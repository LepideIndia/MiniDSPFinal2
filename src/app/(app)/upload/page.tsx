import UploadForm from "./upload-form";
import { requireUser } from "@/lib/supabase/require-user";

export default async function UploadPage() {
  await requireUser();
  return (
    <>
      <header className="page-header">
        <h1>Upload</h1>
        <p>Scan a synthetic CSV or TXT file for sensitive-data patterns.</p>
      </header>
      <UploadForm />
    </>
  );
}
