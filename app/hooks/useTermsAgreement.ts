import { useNavigate } from "react-router";
import { demoWorkspacePath } from "~/lib/workspace";

export function useTermsAgreement() {
  const navigate = useNavigate();

  function acceptTerms() {
    navigate(demoWorkspacePath("/meetings"));
  }

  return { acceptTerms };
}
