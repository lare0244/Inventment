import React from "react";
import { View } from "react-native";
import Svg, { Polyline, Circle, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { useColors } from "@/src/appsettings";

type Point = { month: string; value: number };

// Build "nice" round-number ticks (…, 100, 200 … or …, 1000, 2000 …) covering [0, max].
function niceTicks(max: number, count = 4): { ticks: number[]; niceMax: number } {
  if (max <= 0) return { ticks: [0, 1], niceMax: 1 };
  const rawStep = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, niceMax };
}

function abbrev(v: number): string {
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${+(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(v)}`;
}

export function StockLineChart({
  data, width, height = 160, showGrid = true, formatValue,
}: {
  data: Point[]; width: number; height?: number; showGrid?: boolean;
  formatValue?: (v: number) => string;
}) {
  const C = useColors();
  const fmt = formatValue || abbrev;
  const values = data.map((d) => d.value);
  const dataMax = Math.max(1, ...values);
  const { ticks, niceMax } = niceTicks(dataMax);

  const padL = showGrid ? 38 : 8;
  const padR = 8, padT = 12, padB = 22;
  const w = width, h = height;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = data.length;
  const max = showGrid ? niceMax : dataMax;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / (max || 1)) * innerH;

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  return (
    <View>
      <Svg width={w} height={h}>
        {showGrid && ticks.map((tv, i) => (
          <React.Fragment key={`g${i}`}>
            <SvgLine x1={padL} y1={y(tv)} x2={w - padR} y2={y(tv)}
              stroke={C.divider} strokeWidth={tv === 0 ? 1 : 0.5} strokeDasharray={tv === 0 ? undefined : "3,3"} />
            <SvgText x={padL - 4} y={y(tv) + 3} fontSize={8} fill={C.onSurfaceTertiary} textAnchor="end">
              {fmt(tv)}
            </SvgText>
          </React.Fragment>
        ))}
        {!showGrid && (
          <SvgLine x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke={C.divider} strokeWidth={1} />
        )}
        <Polyline points={points} fill="none" stroke={C.brand} strokeWidth={2.5} strokeLinejoin="round" />
        {data.map((d, i) => (
          <Circle key={i} cx={x(i)} cy={y(d.value)} r={i === n - 1 ? 4 : 2.5} fill={i === n - 1 ? C.brand : C.brandSecondary} />
        ))}
        {data.map((d, i) =>
          i % 3 === 0 || i === n - 1 ? (
            <SvgText key={`t${i}`} x={x(i)} y={h - 6} fontSize={8} fill={C.onSurfaceTertiary} textAnchor="middle">
              {d.month.slice(2)}
            </SvgText>
          ) : null
        )}
      </Svg>
    </View>
  );
}
