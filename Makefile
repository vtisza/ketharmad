# Kétharmad — gyakori parancsok
PORT ?= 8817
URL  := http://localhost:$(PORT)/game/index.html

.PHONY: help start serve open stop test test-quick balance

help:            ## Parancsok listája
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

start:           ## Szerver indítása és a játék megnyitása a böngészőben
	@echo "Kétharmad: $(URL)  (leállítás: Ctrl+C)"
	@(sleep 1 && open "$(URL)") &
	@python3 -m http.server $(PORT)

serve:           ## Csak a szerver indítása (böngésző nélkül)
	python3 -m http.server $(PORT)

open:            ## A játék megnyitása (ha a szerver már fut)
	open "$(URL)"

stop:            ## A háttérben futó szerver leállítása ezen a porton
	-@lsof -ti tcp:$(PORT) | xargs kill 2>/dev/null; echo "leállítva ($(PORT))"

test:            ## Szabálymotor-teszt: gép-gép játszmák minden szinten, 2 és 4 játékossal
	node game/tools/sim.js 200 2 easy
	node game/tools/sim.js 40 2 normal,easy
	node game/tools/sim.js 30 2 hard,normal
	node game/tools/sim.js 10 4 hard,normal,easy,normal

test-quick:      ## Gyors füstteszt (20 játszma)
	node game/tools/sim.js 20 2 normal,easy

balance:         ## Frakció-egyensúly: 400 közepes-közepes játszma
	node game/tools/sim.js 400 2 normal
