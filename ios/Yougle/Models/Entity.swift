import Foundation

struct YougleEntity: Codable, Identifiable, Hashable {
    let id: UUID
    let ownerUserId: UUID
    var kind: String
    var name: String
    var description: String
    var occurredAt: Date?
    var attributes: [String: String]
    var tags: [String]
    let createdAt: Date
    let updatedAt: Date
}

struct EntityLink: Codable, Identifiable, Hashable {
    let id: UUID
    let sourceEntityId: UUID
    let targetEntityId: UUID
    let relationship: String
    let createdAt: Date
}

struct EntityWebLink: Codable, Identifiable, Hashable {
    let id: UUID
    let entityId: UUID
    let label: String
    let url: URL
    let createdAt: Date
}

struct CreateWebLinkRequest: Encodable {
    let label: String
    let url: String
}

struct EntityListResponse: Decodable {
    let entities: [YougleEntity]
}

struct EntityDetailResponse: Decodable {
    let entity: YougleEntity
    let links: [EntityLink]
    let relatedEntities: [YougleEntity]
    let webLinks: [EntityWebLink]
}

struct EntityResponse: Decodable {
    let entity: YougleEntity
}

struct CreateEntityRequest: Encodable {
    let kind: String
    let name: String
    let description: String
    let occurredAt: Date?
    let tags: [String]
    let attributes: [String: String]
    let webLinks: [CreateWebLinkRequest]
}

struct UpdateEntityRequest: Encodable {
    let kind: String
    let name: String
    let description: String
    let occurredAt: Date?
    let tags: [String]
    let attributes: [String: String]
    let webLinks: [CreateWebLinkRequest]

    private enum CodingKeys: String, CodingKey {
        case kind, name, description, occurredAt, tags, attributes, webLinks
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(name, forKey: .name)
        try container.encode(description, forKey: .description)
        try container.encode(occurredAt, forKey: .occurredAt)
        try container.encode(tags, forKey: .tags)
        try container.encode(attributes, forKey: .attributes)
        try container.encode(webLinks, forKey: .webLinks)
    }
}

struct CreateEntityLinkRequest: Encodable {
    let targetEntityId: UUID
    let relationship: String
}

