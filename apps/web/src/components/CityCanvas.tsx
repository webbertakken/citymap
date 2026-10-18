"use client";
import { OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { basis } from "../view/view";
import { Buildings, Mesh } from "./CityMeshes";
import type { CanvasProps } from "./MapView";

/** The city in WebGL: an orthographic camera from the view, drawn only when something changes. */
export default function CityCanvas({ scene, view, theme, mode, table }: CanvasProps) {
  const b = basis(mode, view);
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
      <Buildings buildings={scene.buildings} table={table} mode={mode} theme={theme} />
    </Canvas>
  );
}
