"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Message } from "@/components/Message";
import { createClient } from "@/lib/supabase/browser";

type Notice = { variant: "error" | "info"; title: string; body: string } | null;

export default function SignInPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  async function run(form: HTMLFormElement, mode: "in" | "up") {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setNotice(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setNotice({ variant: "error", title: "Sign-in failed", body: "Check your email and password, then try again." });
          return;
        }
      } else {
        const { data: signUp, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setNotice({
            variant: "error",
            title: "Sign-up failed",
            body: "Use a valid email address and a password of at least 6 characters.",
          });
          return;
        }
        if (!signUp.session) {
          setNotice({ variant: "info", title: "Account created", body: "Confirm your email address, then sign in." });
          return;
        }
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <div className="page-header">
          <h1>MiniDSP</h1>
          <p>Sign in to scan files and review masked findings. Training use only: synthetic accounts and data.</p>
        </div>
        <div className="lp-card lp-card--elevated">
          <div className="lp-card__header">
            <div className="lp-card__title">Sign in</div>
          </div>
          <div className="lp-card__body">
            <form
              className="stack"
              aria-busy={busy}
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                void run(e.currentTarget, "in");
              }}
            >
              <div className="lp-input lp-input--full-width">
                <div className="lp-input__row lp-input__row--label-top">
                  <label className="lp-input__label" htmlFor="email">
                    Email
                  </label>
                  <div className="lp-input__field">
                    <input className="lp-input__input" id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                </div>
              </div>
              <div className="lp-input lp-input--full-width">
                <div className="lp-input__row lp-input__row--label-top">
                  <label className="lp-input__label" htmlFor="password">
                    Password
                  </label>
                  <div className="lp-input__field">
                    <input
                      className="lp-input__input"
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      minLength={6}
                      required
                      aria-describedby="password-hint"
                    />
                  </div>
                </div>
                <div className="lp-input__message" id="password-hint">
                  At least 6 characters.
                </div>
              </div>
              <button type="submit" className="lp-button lp-button--primary lp-button--md lp-button--full-width" disabled={busy}>
                Sign in
              </button>
              <button
                type="button"
                className="lp-button lp-button--secondary lp-button--md lp-button--full-width"
                disabled={busy}
                onClick={(e) => e.currentTarget.form && void run(e.currentTarget.form, "up")}
              >
                Create account
              </button>
            </form>
          </div>
        </div>
        {notice ? (
          <Message variant={notice.variant} title={notice.title}>
            {notice.body}
          </Message>
        ) : null}
      </div>
    </div>
  );
}
