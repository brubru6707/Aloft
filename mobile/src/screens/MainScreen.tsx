import React, { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engine } from '../core/Engine';
import { useHud } from '../core/useHud';
import { UI } from '../config';
import { exportSTL } from '../export';
import { BottomSheet, TopModes } from '../ui/BottomSheet';
import { Crosshair, ModeLabel, SplitOverlay, Toast } from '../ui/Hud';
import { splitViews } from '../ui/splitViews';
import { DeviceList } from '../ui/DeviceList';
import { SceneView } from '../ui/SceneView';
import { GloveCard, PinStrip } from '../ui/GloveCard';

/** Height of the mode/mic bar under the status bar. */
const TOP_BAR = 32;

/** 3D view + overlays + bottom sheet. */
export function MainScreen({ tabBarHeight, topExtra, bottomPad = 4 }: { tabBarHeight: number; topExtra?: React.ReactNode; bottomPad?: number }) {
  const hud = useHud();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const onExport = useCallback(async () => {
    try {
      const n = await exportSTL(engine.objects.builtGroup);
      engine.toast(n ? `Exported ${n} object${n === 1 ? '' : 's'} to STL` : 'Nothing built yet — place something in BUILD mode');
    } catch (e) {
      engine.toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  return (
    <View style={s.root}>
      <SceneView gizmoTop={insets.top + TOP_BAR + 6} />
      <TopModes hud={hud} top={insets.top + 4} extra={topExtra} />
      {hud.split ? (
        <>
          <SplitOverlay hud={hud} views={splitViews(true, width, height)} labelTop={insets.top + TOP_BAR - 30} />
          {/* Each half gets its own glove's settings, in that half's bottom-right corner (clear of its crosshair). */}
          {splitViews(true, width, height).map((v, i) => {
            const atBottom = v.y + v.h >= height - 1;
            const cardW = landscape ? Math.min(190, v.w * 0.46) : Math.min(230, v.w * 0.62);
            const base = height - (v.y + v.h) + (atBottom ? bottomPad : 6);   // the pin strip sits on the half's bottom edge
            return (
              <React.Fragment key={`glove${i}`}>
                <View style={{ position: 'absolute', right: width - (v.x + v.w) + 10, bottom: base }} pointerEvents="box-none">
                  <PinStrip hud={hud} i={i} />
                </View>
                <View style={{ position: 'absolute', left: v.x + v.w - cardW - 8, bottom: base + 42 }} pointerEvents="box-none">
                  <GloveCard hud={hud} i={i} width={cardW} />
                </View>
              </React.Fragment>
            );
          })}
        </>
      ) : (
        <>
          <View style={[s.overlay, { top: insets.top + TOP_BAR + 6, right: landscape ? 428 : 0 }]} pointerEvents="box-none">
            <ModeLabel hud={hud} compact={landscape} />
          </View>
          <Crosshair hover={!!engine.session.hit} />
        </>
      )}
      {/* Device list: left edge under the mode label, above the bottom row; never over the centre. */}
      <DeviceList
        hud={hud}
        top={insets.top + TOP_BAR + 6 + (landscape ? 34 : 52)}
        left={6 + insets.left}
        maxHeight={landscape ? height - (insets.top + TOP_BAR + 6 + 34) - tabBarHeight - 48 : height * 0.4}
      />
      <Toast text={hud.toast} top={insets.top + TOP_BAR + 58} />
      <BottomSheet hud={hud} bottomInset={tabBarHeight} onExport={onExport} landscape={landscape} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3d3d3d' },
  overlay: { position: 'absolute', left: 0, right: 0 },
});
