package utils

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-playground/validator/v10"
)

var Validator *validator.Validate

func init() {
	fmt.Println("Initializing utils package")
	Validator = NewValidator()
}

func NewValidator() *validator.Validate {
	return validator.New(validator.WithRequiredStructEnabled())
}

func WriteJsonResponse(w http.ResponseWriter, status int, data any) error {
	w.Header().Set("Content-Type", "application/json") // Set content type to application/json

	w.WriteHeader(status) // Set http status code

	return json.NewEncoder(w).Encode(data) // encode data as json and write it to response
}

func WriteJsonSucessResponse(w http.ResponseWriter, status int, message string, data any) error {
	response := map[string]any{}

	response["status"] = "success"
	response["message"] = message
	response["data"] = data
	return WriteJsonResponse(w, status, response)
}

func WriteJsonErrorResponse(w http.ResponseWriter, status int, message string, err error) error {
	response := map[string]any{}
	response["status"] = "error"
	response["message"] = message
	response["data"] = err.Error()
	return WriteJsonResponse(w, status, response)

}

func ReadJsonBody(r *http.Request, result any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields() // prevent unknown fields from included in JSON Body
	return decoder.Decode(result)
}
