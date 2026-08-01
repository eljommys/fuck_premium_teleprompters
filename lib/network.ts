import { networkInterfaces } from "node:os";

/**
 * Direcciones IPv4 de la red local en las que el servidor es accesible
 * desde el iPad y el móvil.
 */
export function localAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      addresses.push(info.address);
    }
  }
  // Las 192.168.x.x / 10.x.x.x primero: son las que suele usar el Wi-Fi de casa.
  return addresses.sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));
}
