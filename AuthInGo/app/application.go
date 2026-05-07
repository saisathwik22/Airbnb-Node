package app

import (
	"fmt"
	"net/http"
	"time"
)

type Application struct {
	Config Config
}

// Config holds the configuration for the server
type Config struct {
	Addr string
}

func NewCofig(addr string) Config {
	return Config{
		Addr: addr,
	}
}

func NewApplication(cfg Config) *Application {
	return &Application{
		Config: cfg,
	}
}

func (app *Application) Run() error {

	server := &http.Server{
		Addr:         app.Config.Addr,
		Handler:      nil, // TODO : setup chi router and put it here
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	fmt.Println("Starting server on", app.Config.Addr)

	return server.ListenAndServe()

}
