import SwiftUI

struct EntityDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let entityID: UUID
    let onChanged: () async -> Void
    let onDeleted: (() async -> Void)?
    @State private var response: EntityDetailResponse?
    @State private var errorMessage: String?
    @State private var showingAddConnection = false
    @State private var showingEdit = false
    @State private var showingDeleteConfirmation = false
    @State private var isDeleting = false

    init(
        entityID: UUID,
        onChanged: @escaping () async -> Void = {},
        onDeleted: (() async -> Void)? = nil
    ) {
        self.entityID = entityID
        self.onChanged = onChanged
        self.onDeleted = onDeleted
    }

    var body: some View {
        Group {
            if let response {
                List {
                    Section {
                        Text(response.entity.description.isEmpty ? "No description" : response.entity.description)
                    }
                    if let date = response.entity.occurredAt {
                        Section("Date") { Text(date.formatted(date: .long, time: .shortened)) }
                    }
                    if !response.entity.tags.isEmpty {
                        Section("Tags") { Text(response.entity.tags.map { "#\($0)" }.joined(separator: "  ")) }
                    }
                    if !response.entity.attributes.isEmpty {
                        Section("Details") {
                            ForEach(response.entity.attributes.keys.sorted(), id: \.self) { key in
                                LabeledContent(key, value: response.entity.attributes[key] ?? "")
                            }
                        }
                    }
                    if !response.webLinks.isEmpty {
                        Section("Web links") {
                            ForEach(response.webLinks) { webLink in
                                Link(destination: webLink.url) {
                                    Label(webLink.label.isEmpty ? webLink.url.host() ?? webLink.url.absoluteString : webLink.label, systemImage: "arrow.up.right.square")
                                }
                            }
                        }
                    }
                    if !response.links.isEmpty {
                        Section("Connections") {
                            ForEach(response.links) { link in
                                if let related = relatedEntity(for: link, in: response) {
                                    NavigationLink(value: related.id) {
                                        LabeledContent(link.relationship, value: related.name)
                                    }
                                } else {
                                    Text(link.relationship)
                                }
                            }
                            .onDelete { offsets in deleteConnections(at: offsets, from: response) }
                        }
                    }
                }
                .navigationTitle(response.entity.name)
                .toolbar {
                    Menu("Actions", systemImage: "ellipsis.circle") {
                        Button("Edit entry", systemImage: "pencil") {
                            showingEdit = true
                        }
                        Button("Add connection", systemImage: "link.badge.plus") {
                            showingAddConnection = true
                        }
                        Divider()
                        Button("Delete entry", systemImage: "trash", role: .destructive) {
                            showingDeleteConfirmation = true
                        }
                    }
                }
                .sheet(isPresented: $showingAddConnection) {
                    AddRelationshipView(sourceEntity: response.entity) {
                        await load()
                        await onChanged()
                    }
                }
                .sheet(isPresented: $showingEdit) {
                    EditEntityView(entity: response.entity, webLinks: response.webLinks) {
                        await load()
                        await onChanged()
                    }
                }
                .confirmationDialog(
                    "Delete \(response.entity.name)?",
                    isPresented: $showingDeleteConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Delete entry", role: .destructive) {
                        Task { await deleteEntity() }
                    }
                } message: {
                    Text("This permanently deletes the entry, its web links, attachments, tags, and all connections to other entities.")
                }
            } else {
                ProgressView()
            }
        }
        .task { await load() }
        .alert("Couldn’t load", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Unknown error")
        }
    }

    private func load() async {
        do {
            response = try await APIClient.shared.entity(id: entityID)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func relatedEntity(for link: EntityLink, in response: EntityDetailResponse) -> YougleEntity? {
        let relatedID = link.sourceEntityId == response.entity.id ? link.targetEntityId : link.sourceEntityId
        return response.relatedEntities.first { $0.id == relatedID }
    }

    private func deleteEntity() async {
        guard !isDeleting else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await APIClient.shared.deleteEntity(id: entityID)
            if let onDeleted {
                await onDeleted()
            } else {
                dismiss()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteConnections(at offsets: IndexSet, from response: EntityDetailResponse) {
        let links = offsets.map { response.links[$0] }
        Task {
            do {
                for link in links {
                    try await APIClient.shared.deleteEntityLink(entityID: entityID, linkID: link.id)
                }
                await load()
                await onChanged()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}


