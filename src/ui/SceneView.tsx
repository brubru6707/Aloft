import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import * as THREE from 'three';
import { engine } from '../app/Engine';
import { RENDER, UI } from '../config';
import { AxisGizmo } from './AxisGizmo';

/** Runs the engine every frame, then renders the main scene and the corner gizmo. */
function EngineDriver({ gizmoTop }: { gizmoTop: number }) {
  const gizmo = useRef<AxisGizmo | null>(null);
  if (!gizmo.current) gizmo.current = new AxisGizmo();
  const size = useThree((s) => s.size);
  useEffect(() => {
    gizmo.current!.size = UI.gizmoSize;
    gizmo.current!.margin = UI.gizmoMargin;
    gizmo.current!.top = gizmoTop;
  }, [gizmoTop]);
  // Priority > 0 takes over rendering from r3f so the gizmo can be drawn on top with a scissor.
  useFrame((state, dt) => {
    engine.frame(dt);
    const gl = state.gl as THREE.WebGLRenderer;
    gl.render(engine.world.scene, engine.rig.camera);
    const { axis, deflection } = engine.gizmoState();
    gizmo.current!.render(gl, engine.rig.camera, axis, deflection, size.width, size.height);
  }, 1);
  return null;
}

/**
 * Full-screen 3D view. Touches on it drive the simulator when one is attached:
 * one finger = roll/pitch, two fingers horizontal = yaw.
 */
export function SceneView({ gizmoTop }: { gizmoTop: number }) {
  const touch = useRef({ startX: 0, startY: 0, lastMidX: 0, multi: false });

  const onGrant = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    const sim = engine.sim;
    if (!sim || !t.length) return;
    touch.current = { startX: t[0].pageX, startY: t[0].pageY, lastMidX: t[0].pageX, multi: t.length > 1 };
    if (!touch.current.multi) sim.beginDrag();
  };
  const onMove = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    const sim = engine.sim;
    if (!sim || !t.length) return;
    if (t.length >= 2) {
      const mid = (t[0].pageX + t[1].pageX) / 2;
      if (!touch.current.multi) { touch.current.multi = true; sim.endDrag(); touch.current.lastMidX = mid; }
      sim.dragYaw(mid - touch.current.lastMidX);
      touch.current.lastMidX = mid;
      return;
    }
    if (touch.current.multi) return; // finger lifted after a two-finger drag: wait for a fresh touch
    sim.dragTilt(t[0].pageX - touch.current.startX, t[0].pageY - touch.current.startY);
  };
  const onRelease = () => { engine.sim?.endDrag(); touch.current.multi = false; };

  // The touch layer sits on top of the GL view (a sibling), so the Canvas's own responder cannot steal the drag.
  return (
    <View style={s.fill}>
      <Canvas
        style={s.fill}
        scene={engine.world.scene}
        camera={engine.rig.camera}
        shadows={RENDER.shadows}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.9;
          gl.setClearColor(RENDER.background, 1);
        }}
      >
        <EngineDriver gizmoTop={gizmoTop} />
      </Canvas>
      <View
        style={s.touch}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onRelease}
      />
    </View>
  );
}

const s = StyleSheet.create({ fill: { flex: 1 }, touch: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } });
