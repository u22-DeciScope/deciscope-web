import { Link } from "react-router";
import { AppIcon } from "~/components/AppIcon";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  linkTo?: string;
  showText?: boolean;
}

const sizes = {
  sm: { text: "text-[16px]", gap: "gap-1.5" },
  md: { text: "text-[22px]", gap: "gap-2" },
  lg: { text: "text-[28px]", gap: "gap-2.5" },
};

export function BrandLogo({ size = "md", linkTo, showText = true }: LogoProps) {
  const s = sizes[size];
  const inner = (
    <div className={`flex items-center ${s.gap}`}>
      <AppIcon size={size} />
      {showText && (
        <span className={`${s.text} font-bold`} style={{ color: "var(--text-main)" }}>
          Deciscope
        </span>
      )}
    </div>
  );

  if (linkTo) return <Link to={linkTo}>{inner}</Link>;
  return inner;
}
