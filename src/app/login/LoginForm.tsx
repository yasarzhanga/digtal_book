"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("student@demo.local");
  const [password, setPassword] = useState("demo123456");
  const [error, setError] = useState("");
  async function submit() {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      setError("账号或密码不正确");
      return;
    }
    router.push("/demo");
    router.refresh();
  }
  return (
    <main className="center-page">
      <section className="login-card">
        <h1>登录数字教材 Demo</h1>
        <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button type="button" onClick={() => void submit()}>登录</button>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
