import React, { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engine } from '../core/Engine';
import { useHud } from '../core/useHud';
import { UI } from '../config';
import { exportSTL } from '../export';
import { BottomSheet, TopModes } from '../ui/BottomSheet';
import { Crosshair, ModeLabel, Toast } from '../ui/Hud';
import { DeviceList } from '../ui/DeviceList';
import { SceneView } from '../ui/SceneView';

/** Height of the mode/mic bar under the status bar. */
const TOP_BAR = 32;

/** 3D view + overlays + bottom sheet. */
export function MainScreen({ tabBarHeight }: { tabBarHeight: number }) {
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
      <TopModes hud={hud} top={insets.top + 4} right={landscape ? 454 : 26} />
      <View style={[s.overlay, { top: insets.top + TOP_BAR + 6, right: landscape ? 428 : 0 }]} pointerEvents="box-none">
        <ModeLabel hud={hud} compact={landscape} />
      </View>
      <Crosshair hover={!!engine.session.hit} />
      {/* Device list: right edge under the gizmo, above the bottom row; capped in portrait so an open bottom panel stays clear. */}
      <DeviceList
        hud={hud}
        top={insets.top + TOP_BAR + 6 + UI.gizmoSize + 8}
        right={6 + insets.right}
        maxHeight={landscape ? height - (insets.top + TOP_BAR + 6 + UI.gizmoSize + 8) - tabBarHeight - 8 : height * 0.4}
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
