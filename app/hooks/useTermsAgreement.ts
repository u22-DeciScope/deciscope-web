import { useNavigate } from "react-router";
import { demoWorkspacePath } from "~/routing/workspacePaths";

export function useTermsAgreement() {
  const navigate = useNavigate();

  function acceptTerms() {
    navigate(demoWorkspacePath("/meetings"));
  }

  return { acceptTerms };
}
