/**
 * QR code drawn with plain Views (no SVG / image libraries). Each row is
 * run-length encoded so a typical contact code is a few hundred Views.
 */
import React, {useMemo} from 'react';
import {View} from 'react-native';
import qrcode from 'qrcode-generator';

export function qrMatrix(value: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({length: n}, (_, r) => Array.from({length: n}, (__, c) => qr.isDark(r, c)));
}

export default function QRCode({
  value,
  size,
  color = '#000000',
  background = '#FFFFFF',
}: {
  value: string;
  size: number;
  color?: string;
  background?: string;
}) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const quiet = 2; // modules of white border
  const cell = size / (matrix.length + quiet * 2);

  return (
    <View style={{width: size, height: size, backgroundColor: background, padding: cell * quiet}}>
      {matrix.map((row, r) => {
        const runs: {start: number; len: number}[] = [];
        for (let c = 0; c < row.length; c++) {
          if (!row[c]) continue;
          const last = runs[runs.length - 1];
          if (last && last.start + last.len === c) last.len++;
          else runs.push({start: c, len: 1});
        }
        return (
          <View key={r} style={{height: cell, flexDirection: 'row'}}>
            {runs.map(run => (
              <View
                key={run.start}
                style={{
                  position: 'absolute',
                  left: run.start * cell,
                  width: run.len * cell + 0.5, // overlap avoids hairline gaps
                  height: cell + 0.5,
                  backgroundColor: color,
                }}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
