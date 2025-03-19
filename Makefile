.PHONY: all clean server client install-deps run-client run-server

all: install-deps server client

# Install dependencies for both client and server
install-deps:
	cd client && npm install
	cd server && go mod download

# Build and run the server
server:
	cd server && go build -o server

run-server: server
	cd server && ./server

# Build and run the client
client:
	cd client && npm run build

run-client:
	cd client && npm run dev

# Development - run both client and server
dev:
	make -j 2 run-client run-server

# Clean build artifacts
clean:
	rm -f server/server
	cd client && rm -rf dist/