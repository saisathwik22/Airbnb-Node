package main

import (
	"AuthInGo/app"
)

func main() {

	cfg := app.NewCofig(":8080")
	app := app.NewApplication(cfg)
	app.Run()
}
