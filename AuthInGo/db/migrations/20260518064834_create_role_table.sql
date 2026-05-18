-- +goose Up

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INSERT INTO roles (name, description) VALUES
-- ('admin', 'Administrator with full access'),
-- ('user', 'Regular with limited access'),
-- ('moderator', 'Moderator user with minimal access');

-- +goose Down
DROP TABLE IF EXISTS roles;