#!/usr/bin/env bash
# Generate LAN HTTPS certs so iPads can use their cameras (getUserMedia
# requires a secure context on non-localhost origins).
#
# PREFERRED: mkcert (https://github.com/FiloSottile/mkcert)
#   brew install mkcert          (macOS)
#   choco install mkcert         (Windows)
# mkcert creates a local CA; you install that CA once on each iPad and
# every cert it signs is trusted. See RUNBOOK.md for the iPad steps.
#
# Usage: ./scripts/make-certs.sh <LAN-IP> [more IPs/names...]
#   e.g. ./scripts/make-certs.sh 192.168.8.10
# Tip: give the server machine a STATIC IP on the travel router first,
# because the cert is bound to the IP.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <LAN-IP> [more IPs or hostnames...]" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "Using mkcert…"
  mkcert -install
  mkcert -key-file "$DIR/server-key.pem" -cert-file "$DIR/server-cert.pem" \
    localhost 127.0.0.1 "$@"
  echo
  echo "Root CA to install on iPads: $(mkcert -CAROOT)/rootCA.pem"
  echo "AirDrop/email that file to each iPad, install the profile, then enable"
  echo "full trust: Settings > General > About > Certificate Trust Settings."
else
  echo "mkcert not found — falling back to a self-signed CA via openssl."
  echo "(mkcert is easier; install it if you can.)"
  # Make our own mini-CA so iPads can trust one file, like mkcert.
  openssl genrsa -out "$DIR/ca-key.pem" 2048
  openssl req -x509 -new -nodes -key "$DIR/ca-key.pem" -sha256 -days 90 \
    -subj "/CN=Local36 Check-In CA" -out "$DIR/rootCA.pem"

  SAN="DNS:localhost,IP:127.0.0.1"
  for h in "$@"; do
    if [[ "$h" =~ ^[0-9.]+$ ]]; then SAN="$SAN,IP:$h"; else SAN="$SAN,DNS:$h"; fi
  done

  openssl genrsa -out "$DIR/server-key.pem" 2048
  openssl req -new -key "$DIR/server-key.pem" -subj "/CN=Local36 Check-In" \
    -out "$DIR/server.csr"
  openssl x509 -req -in "$DIR/server.csr" -CA "$DIR/rootCA.pem" -CAkey "$DIR/ca-key.pem" \
    -CAcreateserial -days 90 -sha256 \
    -extfile <(printf "subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" "$SAN") \
    -out "$DIR/server-cert.pem"
  rm -f "$DIR/server.csr"
  echo
  echo "Root CA to install on iPads: $DIR/rootCA.pem"
  echo "AirDrop/email that file to each iPad, install the profile, then enable"
  echo "full trust: Settings > General > About > Certificate Trust Settings."
fi

echo
echo "Done. Restart the server (npm start) — it will pick up certs/ and serve HTTPS on :8443."
