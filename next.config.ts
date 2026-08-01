import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador de desarrollo se superpone a los controles del mando y del
  // visor, que ocupan toda la pantalla en el móvil y el iPad.
  devIndicators: false,
};

export default nextConfig;
