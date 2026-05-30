"use client";

import { useEffect, useRef } from "react";
import type { ApexOptions } from "apexcharts";
import type ApexCharts from "apexcharts";

type ApexChartProps = {
  options: ApexOptions;
  series: NonNullable<ApexOptions["series"]>;
  type: NonNullable<ApexOptions["chart"]>["type"];
  height?: number;
};

export function ApexChart({
  options,
  series,
  type,
  height = 320,
}: ApexChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: ApexCharts | null = null;
    let cancelled = false;

    void import("apexcharts").then(({ default: ApexChartsConstructor }) => {
      if (cancelled || !containerRef.current) {
        return;
      }

      chart = new ApexChartsConstructor(containerRef.current, {
        ...options,
        series,
        chart: {
          ...options.chart,
          type,
          height,
          fontFamily: "inherit",
          toolbar: { show: false },
        },
      });

      void chart.render();
    });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [height, options, series, type]);

  return <div ref={containerRef} />;
}
