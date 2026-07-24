package storage

import (
	"fmt"
	"log"

	"samuel-meyers.com/undoku/models"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Storage struct {
	DB *gorm.DB
}

// NewPostgresStorage initializes a GORM connection using a PostgreSQL DSN
func NewPostgresStorage(dsn string) (*Storage, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to postgres: %w", err)
	}

	if err := db.AutoMigrate(&models.PuzzleRecord{}); err != nil {
		return nil, fmt.Errorf("failed to auto-migrate postgres schema: %w", err)
	}

	log.Println("[Storage] Connected to PostgreSQL & migrated schema successfully.")
	return &Storage{DB: db}, nil
}

// NewSQLiteStorage initializes a GORM connection using a local SQLite file (great for dev/testing)
func NewSQLiteStorage(dbPath string) (*Storage, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to sqlite: %w", err)
	}

	if err := db.AutoMigrate(&models.PuzzleRecord{}); err != nil {
		return nil, fmt.Errorf("failed to auto-migrate sqlite schema: %w", err)
	}

	log.Printf("[Storage] Connected to SQLite DB at %s & migrated schema successfully.\n", dbPath)
	return &Storage{DB: db}, nil
}

func (s *Storage) SavePuzzle(record *models.PuzzleRecord) error {
	if err := s.DB.Create(record).Error; err != nil {
		return fmt.Errorf("failed to save puzzle record: %w", err)
	}
	return nil
}

func (s *Storage) GetPuzzleByID(id uint) (*models.PuzzleRecord, error) {
	var record models.PuzzleRecord
	if err := s.DB.First(&record, id).Error; err != nil {
		return nil, fmt.Errorf("puzzle with ID %d not found: %w", id, err)
	}
	return &record, nil
}

func (s *Storage) ListPuzzles(limit, offset int, ratingFilter string) ([]models.PuzzleRecord, error) {
	var records []models.PuzzleRecord
	query := s.DB.Limit(limit).Offset(offset).Order("created_at desc")

	if ratingFilter != "" {
		query = query.Where("difficulty_rating = ?", ratingFilter)
	}

	if err := query.Find(&records).Error; err != nil {
		return nil, fmt.Errorf("failed to list puzzle records: %w", err)
	}
	return records, nil
}

func (s *Storage) DeletePuzzleByID(id uint) error {
	if err := s.DB.Delete(&models.PuzzleRecord{}, id).Error; err != nil {
		return fmt.Errorf("failed to delete puzzle ID %d: %w", id, err)
	}
	return nil
}
