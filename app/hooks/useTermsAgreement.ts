import { useNavigate } from "react-router";
import { WORKSPACE_MEETINGS_PATH } from "~/lib/workspace";

export function useTermsAgreement() {
  const navigate = useNavigate();

  function acceptTerms() {
    navigate(WORKSPACE_MEETINGS_PATH);
  }

  return { acceptTerms };
}
