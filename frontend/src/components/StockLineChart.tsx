import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { C, F } from "@/src/theme";

type Point = { month: string; value: number };

export function StockLineChart({ data, width, height = 160 }: { data: Point[]; width: number; height?: number }) {
  const padL = 8, padR = 8, padT = 12, padB = 22;
  const w = width, h = height;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);
  const min = 0;
  const n = data.length;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  return (
    <View>
      <Svg width={w} height={h}>
        {/* baseline */}
        <SvgLine x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke={C.divider} strokeWidth={1} />
        <Polyline points={points} fill="none" stroke={C.brand} strokeWidth={2.5} strokeLinejoin="round" />
        {data.map((d, i) => (
          <Circle key={i} cx={x(i)} cy={y(d.value)} r={i === n - 1 ? 4 : 2.5} fill={i === n - 1 ? C.brand : C.brandSecondary} />
        ))}
        {/* x labels: show every 3rd month */}
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
