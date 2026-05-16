package middlewares

import (
	"AuthInGo/dto"
	"AuthInGo/utils"
	"context"
	"fmt"
	"net/http"
)

func UserLoginRequestValidator(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload dto.LoginUserRequestDTO

		// Read and decode json body into payload
		if err := utils.ReadJsonBody(r, &payload); err != nil {
			utils.WriteJsonErrorResponse(w, http.StatusBadRequest, "Invalid request body", err)
			return
		}

		// validate payload using validator instance
		if err := utils.Validator.Struct(payload); err != nil {
			utils.WriteJsonErrorResponse(w, http.StatusBadRequest, "Validation failed", err)
			return
		}

		fmt.Println("Payload received for login:", payload)

		ctx := context.WithValue(r.Context(), "payload", payload) // create a new context with payload

		next.ServeHTTP(w, r.WithContext(ctx)) // call the next handler in the chain
	})
}

func UserCreateRequestValidator(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload dto.CreateUserRequestDTO

		// Read and decode JSON body into payload
		if err := utils.ReadJsonBody(r, &payload); err != nil {
			utils.WriteJsonErrorResponse(w, http.StatusBadRequest, "Invalid request body", err)
			return
		}

		// Validate payload using validator instance
		if err := utils.Validator.Struct(payload); err != nil {
			utils.WriteJsonErrorResponse(w, http.StatusBadRequest, "Validation failed", err)
			return
		}
		ctx := context.WithValue(r.Context(), "payload", payload)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
