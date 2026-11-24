// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordField } from "@/components/auth/password-field";

describe("PasswordField", () => {
  afterEach(cleanup);

  it.each(["current-password", "new-password"] as const)("toggles visibility and preserves %s autocomplete", (autoComplete) => {
    render(
      <label htmlFor="password">
        Password
        <PasswordField id="password" name="password" autoComplete={autoComplete} value="correct horse" onChange={() => {}} required />
      </label>,
    );

    const input = screen.getByLabelText("Password");
    expect(input.getAttribute("type")).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe(autoComplete);
    expect(screen.getByRole("button", { name: "Show password" }).getAttribute("type")).toBe("button");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.getAttribute("type")).toBe("password");
  });
});
