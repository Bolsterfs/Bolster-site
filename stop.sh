#!/bin/bash
echo "Stopping Bolster..."
pkill -f "tsx watch" 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "stripe listen" 2>/dev/null
cd ~/bolster/bolster && docker-compose stop
echo "✅ All stopped"
