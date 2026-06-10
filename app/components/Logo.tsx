import { Link } from "react-router";
import { HiSparkles } from "react-icons/hi2";

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
      <HiSparkles className={`${s.icon} shrink-0`} style={{ color: "var(--text-main)" }} />
      <span className={`${s.text} font-bold`} style={{ color: "var(--text-main)" }}>
        Desiscope
      </span>
    </div>
  );

  if (linkTo) return <Link to={linkTo}>{inner}</Link>;
  return inner;
}
