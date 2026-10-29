#!/usr/bin/env bash

set -e

echo "=================================="
echo " Updating React Frontend"
echo "=================================="

echo "[1/2] Pulling latest Git changes..."
git pull

echo "[2/2] Starting React development server..."
npm run dev
