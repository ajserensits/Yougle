import Foundation

enum APIError: LocalizedError {
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "The server returned an invalid response."
        case let .server(_, message): message
        }
    }
}

struct APIClient {
    static let shared = APIClient()
    var baseURL = URL(string: "http://localhost:3000")!
    private let localUserID = "00000000-0000-4000-8000-000000000001"

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            let fractionalFormatter = ISO8601DateFormatter()
            fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractionalFormatter.date(from: value) {
                return date
            }

            let standardFormatter = ISO8601DateFormatter()
            standardFormatter.formatOptions = [.withInternetDateTime]
            if let date = standardFormatter.date(from: value) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO 8601 date: \(value)"
            )
        }
        return decoder
    }()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    func searchEntities(query: String = "") async throws -> [YougleEntity] {
        var components = URLComponents(url: baseURL.appending(path: "api/entities"), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = [URLQueryItem(name: "q", value: query)]
        }
        let response: EntityListResponse = try await request(components.url!)
        return response.entities
    }

    func entity(id: UUID) async throws -> EntityDetailResponse {
        try await request(baseURL.appending(path: "api/entities/\(id.uuidString.lowercased())"))
    }

    func createEntity(_ input: CreateEntityRequest) async throws -> YougleEntity {
        var request = URLRequest(url: baseURL.appending(path: "api/entities"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(input)
        let response: EntityResponse = try await self.request(request)
        return response.entity
    }

    func updateEntity(id: UUID, input: UpdateEntityRequest) async throws -> YougleEntity {
        var request = URLRequest(url: baseURL.appending(path: "api/entities/\(id.uuidString.lowercased())"))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(input)
        let response: EntityResponse = try await self.request(request)
        return response.entity
    }

    func deleteEntity(id: UUID) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/entities/\(id.uuidString.lowercased())"))
        request.httpMethod = "DELETE"
        try await perform(request)
    }

    func createEntityLink(sourceEntityID: UUID, targetEntityID: UUID, relationship: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/entities/\(sourceEntityID.uuidString.lowercased())/links"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(CreateEntityLinkRequest(
            targetEntityId: targetEntityID,
            relationship: relationship
        ))
        let _: EntityLinkResponse = try await self.request(request)
    }

    func deleteEntityLink(entityID: UUID, linkID: UUID) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/entities/\(entityID.uuidString.lowercased())/links/\(linkID.uuidString.lowercased())"))
        request.httpMethod = "DELETE"
        try await perform(request)
    }

    private func request<Response: Decodable>(_ url: URL) async throws -> Response {
        try await request(URLRequest(url: url))
    }

    private func request<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data = try await execute(request)
        return try decoder.decode(Response.self, from: data)
    }

    private func perform(_ request: URLRequest) async throws {
        _ = try await execute(request)
    }

    private func execute(_ request: URLRequest) async throws -> Data {
        var userRequest = request
        userRequest.setValue(localUserID, forHTTPHeaderField: "X-Yougle-User-ID")
        let (data, response) = try await URLSession.shared.data(for: userRequest)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = object?["error"] as? String ?? "The request failed."
            throw APIError.server(status: http.statusCode, message: message)
        }
        return data
    }
}

private struct EntityLinkResponse: Decodable {
    let link: EntityLink
}

