package services

import (
	db "AuthInGo/db/repositories"
	"AuthInGo/utils"
	"fmt"
)

type UserService interface {
	GetUserById() error
	CreateUser() error
	LoginUser() error
}

type UserServiceImpl struct {
	userRepository db.UserRepository
}

func NewUserService(_userRepository db.UserRepository) UserService {
	return &UserServiceImpl{
		userRepository: _userRepository,
	}
}

func (u *UserServiceImpl) GetUserById() error {
	fmt.Println("Fetching user in UserService")
	u.userRepository.GetByID()
	return nil
}

func (u *UserServiceImpl) CreateUser() error {
	fmt.Println("Creating user in UserService")
	password := "example_password"
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}
	u.userRepository.Create(
		"username_example_1",
		"user_1@example.com",
		hashedPassword,
	)
	return nil
}

func (u *UserServiceImpl) LoginUser() error {
	response := utils.CheckPasswordHash("example_password_wrong", "$2a$10$vpuySk70MyMv3ZbqeBGKLuwNb8EWbfiXU/QHmraLlWCWWrImWMS36")
	fmt.Println("Login response:", response)
	return nil
}
