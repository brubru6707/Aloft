import React, { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engine } from '../core/Engine';
import { useHud } from '../core/useHud';
import { UI } from '../config';
import { exportSTL } from '../export';
import { BottomSheet } from '../ui/BottomSheet';
import { Crosshair, ModeLabel, Toast } from '../ui/Hud';
import { SceneView } from '../ui/SceneView';
import { SimButtons } from '../ui/SimButtons';

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
      <SceneView gizmoTop={insets.top + UI.gizmoMargin} />
      <View style={[s.overlay, { top: insets.top + 10, right: landscape ? 412 : 0 }]} pointerEvents="box-none">
        <ModeLabel hud={hud} compact={landscape} />
      </View>
      <Crosshair hover={!!engine.session.hit} />
      {hud.sourceKind === 'sim' ? (
        <View style={[s.simWrap, { top: insets.top + UI.gizmoMargin + UI.gizmoSize + 16, right: landscape ? 412 : 0 }]} pointerEvents="box-none">
          <SimButtons down={hud.buttons} />
        </View>
      ) : null}
      <Toast text={hud.toast} bottom={landscape ? 24 : 300} />
      <BottomSheet hud={hud} bottomInset={tabBarHeight} onExport={onExport} landscape={landscape} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3d3d3d' },
  overlay: { position: 'absolute', left: 0, right: 0 },
  simWrap: { position: 'absolute', right: 0, width: 80, height: 260 },
});
