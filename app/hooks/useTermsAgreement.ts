import { useNavigate } from "react-router";

export function useTermsAgreement() {
  const navigate = useNavigate();

  function acceptTerms() {
    navigate("/");
  }

  return { acceptTerms };
}
