#!/usr/bin/env python3
"""Aplica los permisos y el servicio GPS de LOGISTEC al AndroidManifest generado."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ANDROID_NS = "http://schemas.android.com/apk/res/android"
ANDROID = f"{{{ANDROID_NS}}}"
ET.register_namespace("android", ANDROID_NS)


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python patch_android_manifest.py <AndroidManifest.xml>", file=sys.stderr)
        return 2

    manifest_path = Path(sys.argv[1])
    if not manifest_path.is_file():
        print(f"No existe el manifiesto: {manifest_path}", file=sys.stderr)
        return 1

    tree = ET.parse(manifest_path)
    root = tree.getroot()

    required_permissions = [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION",
        "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
        "android.permission.POST_NOTIFICATIONS",
    ]
    existing_permissions = {
        element.get(ANDROID + "name")
        for element in root.findall("uses-permission")
    }
    for permission_name in required_permissions:
        if permission_name not in existing_permissions:
            ET.SubElement(root, "uses-permission", {ANDROID + "name": permission_name})

    application = root.find("application")
    if application is None:
        raise RuntimeError("El AndroidManifest no contiene <application>.")

    service_name = "com.logistec.mobile.gps.GpsForegroundService"
    service = next(
        (item for item in application.findall("service")
         if item.get(ANDROID + "name") == service_name),
        None,
    )
    if service is None:
        service = ET.SubElement(application, "service")

    service.set(ANDROID + "name", service_name)
    service.set(ANDROID + "exported", "false")
    service.set(ANDROID + "foregroundServiceType", "location|dataSync")

    tree.write(manifest_path, encoding="utf-8", xml_declaration=True)
    print("AndroidManifest actualizado con permisos y servicio GPS de LOGISTEC.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
