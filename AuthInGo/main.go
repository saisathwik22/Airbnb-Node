package main

import (
	"AuthInGo/app"
)

func main() {

	// construtors refactoring
	cfg := app.NewCofig(":8080")
	app := app.NewApplication(cfg)
	app.Run()
}
