import UtilityMark from "./UtilityMark";

type UtilityBrandProps = {
  compact?: boolean;
  inverted?: boolean;
  size?: "default" | "large";
  showTitle?: boolean;
};

export default function UtilityBrand({
  compact = false,
  inverted = false,
  size = "default",
  showTitle = true,
}: UtilityBrandProps) {
  const isLarge = size === "large" && !compact;
  const markSize = compact ? "size-11" : isLarge ? "size-20" : "size-14";
  const gapSize = isLarge ? "gap-5" : "gap-3";
  const titleSize = compact ? "text-lg" : isLarge ? "text-2xl" : "text-xl";
  const subtitleSize = isLarge ? "text-sm" : "text-xs";
  const titleTone = inverted ? "text-white" : "text-slate-950 dark:text-white";
  const subtitleTone = inverted ? "text-white/75" : "text-slate-500 dark:text-white/75";

  return (
    <div className={`flex items-center ${gapSize}`}>
      <div className={`flex shrink-0 items-center justify-center ${markSize}`}>
        <UtilityMark className="h-full w-full" />
      </div>
      {showTitle ? (
        <div className="min-w-0">
          <p className={`font-extrabold leading-tight ${titleTone} ${titleSize}`}>
            Utility Monitoring
          </p>
          <p className={`font-medium ${subtitleTone} ${subtitleSize}`}>
            System
          </p>
        </div>
      ) : null}
    </div>
  );
}
