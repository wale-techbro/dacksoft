"use client";

import { useState, type ChangeEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  minLength?: number;
  required?: boolean;
};

export function PasswordField({
  id,
  name,
  autoComplete,
  value,
  onChange,
  minLength,
  required,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="auth-password-input">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={onChange}
        required={required}
      />
      <button
        className="auth-password-toggle"
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </span>
  );
}
