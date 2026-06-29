import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { useColors } from "@/src/appsettings";
import { F, S } from "@/src/theme";

type Series = { key: string; label: string; color: string; data: number[] };

export function StatusLineChart({ months, series, width, height = 180 }: {
  months: string[]; series: Series[]; width: number; height?: number;
}) {
  const C = useColors();
  const padL = 28, padR = 8, padT = 10, padB = 22;
  const w = Math.max(220, width);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.data));
  const n = months.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxVal) * innerH;
  const ticks = [0, Math.ceil(maxVal / 2), maxVal].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <View>
      <Svg width={w} height={height}>
        {ticks.map((tk) => (
          <React.Fragment key={`t${tk}`}>
            <SvgLine x1={padL} y1={y(tk)} x2={w - padR} y2={y(tk)} stroke={C.divider} strokeWidth={1} />
            <SvgText x={padL - 6} y={y(tk) + 3} fontSize={9} fill={C.onSurfaceTertiary} textAnchor="end">{tk}</SvgText>
          </React.Fragment>
        ))}
        {months.map((m, i) => (
          (i % 3 === 0 || i === n - 1) ? (
            <SvgText key={`m${i}`} x={x(i)} y={height - 6} fontSize={8} fill={C.onSurfaceTertiary} textAnchor="middle">{m.slice(2)}</SvgText>
          ) : null
        ))}
        {series.map((s) => (
          <Polyline key={s.key} points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
        ))}
      </Svg>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendTxt, { color: C.onSurfaceSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: S.md, marginTop: S.sm, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontFamily: F.text, fontSize: 11 },
});
