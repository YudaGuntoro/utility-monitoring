type SHMSMarkProps = {
  className?: string;
  variant?: "auto" | "dark" | "light";
};

export default function SHMSMark({ className = "", variant = "auto" }: SHMSMarkProps) {
  if (variant === "dark") {
    return <img alt="Utility Monitoring" className={className} src="/images/logo/utility-sidebar-logo.png" />;
  }

  if (variant === "light") {
    return <img alt="Utility Monitoring" className={className} src="/images/logo/utility-sidebar-logo.png" />;
  }

  return (
    <img alt="Utility Monitoring" className={className} src="/images/logo/utility-sidebar-logo.png" />
  );
}
