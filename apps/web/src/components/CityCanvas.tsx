"use client";
import type { Layer } from "@citymap/scene";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { basis } from "../view/view";
import type { CanvasProps } from "./MapView";

/** One layer as one mesh: merged geometry with vertex colours, no lighting (the colours carry the light). */
function Mesh({ layer }: { readonly layer: Layer }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(layer.positions, 3));
    g.setAttribute("color", new BufferAttribute(layer.colours, 3));
    g.setIndex(new BufferAttribute(layer.indices, 1));
    return g;
  }, [layer]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors side={DoubleSide} />
    </mesh>
  );
}

/** The city in WebGL: an orthographic camera from the view, drawn only when something changes. */
export default function CityCanvas({ scene, view, theme }: CanvasProps) {
  const b = basis();
  const distance = 2000;
  return (
    <Canvas className="canvas" frameloop="demand" dpr={[1, 2]} linear flat aria-hidden="true">
      <color attach="background" args={[theme.country]} />
      <OrthographicCamera
        makeDefault
        position={[view.centre.x + b.eye[0] * distance, b.eye[1] * distance, view.centre.z + b.eye[2] * distance]}
        up={[b.up[0], b.up[1], b.up[2]]}
        zoom={view.zoom}
        near={1}
        far={distance * 4}
        onUpdate={(camera) => camera.lookAt(view.centre.x, 0, view.centre.z)}
      />
      {scene.layers.map((layer) => (
        <Mesh key={layer.name} layer={layer} />
      ))}
    </Canvas>
  );
}
