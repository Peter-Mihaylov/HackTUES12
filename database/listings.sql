CREATE TABLE listings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    farm_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category ENUM('vegetables', 'fruits', 'dairy', 'meat', 'eggs', 'honey', 'grains', 'wine', 'herbs', 'preserves', 'other') NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    price_unit VARCHAR(50),
    status ENUM('available', 'seasonal', 'unavailable') NOT NULL DEFAULT 'available',
    is_organic BOOLEAN NOT NULL DEFAULT FALSE,
    image VARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_farm_id (farm_id)
);