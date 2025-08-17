module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleNameMapping: {
    '^@e-commerce/shared$': '<rootDir>/dist'
  },
  collectCoverageFrom: [
    'utils/**/*.ts',
    'types/**/*.ts',
    'index.ts',
    '!**/*.d.ts',
    '!**/*.test.ts'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  modulePathIgnorePatterns: [
    '/dist/',
    '/coverage/'
  ]
};
