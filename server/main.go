package main

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

var (
	logger   *zap.Logger
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for development
		},
	}
	clients = make(map[*websocket.Conn]bool)
)

func main() {
	// Initialize logger
	var err error
	logger, err = zap.NewDevelopment()
	if err != nil {
		panic(err)
	}
	defer logger.Sync()

	// Setup HTTP routes
	http.HandleFunc("/ws", handleWebSocket)

	// Setup proxy to frontend development server
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		proxy := &httputil.ReverseProxy{
			Director: func(req *http.Request) {
				req.URL.Scheme = "http"
				req.URL.Host = "localhost:5173"
				req.Host = "localhost:5173"
			},
		}
		proxy.ServeHTTP(w, r)
	})

	// Start server
	port := ":8080"
	logger.Info("Server starting", zap.String("port", port))
	if err := http.ListenAndServe(port, nil); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade connection", zap.Error(err))
		return
	}
	defer conn.Close()

	// Register client
	clients[conn] = true
	defer delete(clients, conn)

	logger.Info("Client connected", zap.String("remote_addr", conn.RemoteAddr().String()))

	// Handle WebSocket messages
	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			logger.Error("Error reading message", zap.Error(err), zap.String("remote_addr", conn.RemoteAddr().String()))
			break
		}

		// Log received message
		logger.Info("Received message",
			zap.String("type", msg.Type),
			zap.String("from", conn.RemoteAddr().String()),
			zap.String("payload_preview", string(msg.Payload)[:min(len(msg.Payload), 100)]))

		// Broadcast message to all other clients
		for client := range clients {
			if client != conn {
				logger.Info("Forwarding message",
					zap.String("type", msg.Type),
					zap.String("from", conn.RemoteAddr().String()),
					zap.String("to", client.RemoteAddr().String()))

				err := client.WriteJSON(msg)
				if err != nil {
					logger.Error("Error sending message",
						zap.Error(err),
						zap.String("to", client.RemoteAddr().String()))
					client.Close()
					delete(clients, client)
				}
			}
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
