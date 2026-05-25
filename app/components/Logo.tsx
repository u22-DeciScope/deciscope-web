import { Link } from "react-router";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  linkTo?: string;
}

const sizes = {
  sm: { icon: "w-[18px] h-[18px]", text: "text-[16px]", gap: "gap-1.5" },
  md: { icon: "w-[22px] h-[22px]", text: "text-[22px]", gap: "gap-2"   },
  lg: { icon: "w-[28px] h-[28px]", text: "text-[28px]", gap: "gap-2.5" },
};

export function Logo({ size = "md", linkTo }: LogoProps) {
  const s = sizes[size];
  const inner = (
    <div className={`flex items-center ${s.gap}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={`${s.icon} shrink-0`} style={{ color: "var(--text-main)" }}>
        <path d="M12 2l1.09 3.26L16.5 4.27l-2.18 2.73L16.5 9.73l-3.41-.99L12 12l-1.09-3.26L7.5 9.73l2.18-2.73L7.5 4.27l3.41.99L12 2z" />
      </svg>
      <span className={`${s.text} font-bold`} style={{ color: "var(--text-main)" }}>
        Desiscope
      </span>
    </div>
  );

  if (linkTo) return <Link to={linkTo}>{inner}</Link>;
  return inner;
}
