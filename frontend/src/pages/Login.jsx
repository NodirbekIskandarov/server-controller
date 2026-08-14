import { useState } from "react";
import { useLoginMutation } from "../store/api";

export default function Login() {
  const [login, { isLoading }] = useLoginMutation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(form).unwrap();
    } catch (err) {
      setError(err?.data?.message || "Kirib bo'lmadi.");
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={onSubmit}>
        <div className="head">
          <div className="mark">SN</div>
          <div>
            <h1>Server nazorati</h1>
            <div className="sub">169.58.23.132</div>
          </div>
        </div>

        {error && <div className="note err">{error}</div>}

        <label>
          <span>Login</span>
          <input
            className="field"
            type="text" autoComplete="username" autoFocus required maxLength={64}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label>
          <span>Parol</span>
          <input
            className="field"
            type="password" autoComplete="current-password" required maxLength={256}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <button className="btn pri" type="submit" disabled={isLoading}>
          {isLoading ? "Tekshirilmoqda…" : "Kirish"}
        </button>
      </form>
    </div>
  );
}
