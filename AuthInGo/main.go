package main

import (
	"AuthInGo/app"
	config "AuthInGo/config/env"
)

func main() {

	config.Load() // make sures env variables always loaded from .env

	// construtors refactoring
	cfg := app.NewCofig()
	app := app.NewApplication(cfg)

	app.Run()
}
