import SwiftUI

struct AddRelationshipView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var entities: [YougleEntity] = []
    @State private var selectedEntityID: UUID?
    @State private var relationship = ""
    @State private var query = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    let sourceEntity: YougleEntity
    let onCreated: () async -> Void

    private var filteredEntities: [YougleEntity] {
        entities.filter { entity in
            entity.id != sourceEntity.id && (
                query.isEmpty
                || entity.name.localizedCaseInsensitiveContains(query)
                || entity.kind.localizedCaseInsensitiveContains(query)
                || entity.tags.contains { $0.localizedCaseInsensitiveContains(query) }
            )
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Relationship") {
                    TextField("For example: wanted by", text: $relationship)
                }

                Section("Connect \(sourceEntity.name) to") {
                    ForEach(filteredEntities) { entity in
                        Button {
                            selectedEntityID = entity.id
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(entity.name)
                                    Text(entity.kind.capitalized)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if selectedEntityID == entity.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.tint)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Add connection")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Find an entity")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(selectedEntityID == nil || relationship.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .task {
                do { entities = try await APIClient.shared.searchEntities() }
                catch { errorMessage = error.localizedDescription }
            }
            .alert("Couldn’t add connection", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "Unknown error")
            }
        }
    }

    private func save() async {
        guard let selectedEntityID else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await APIClient.shared.createEntityLink(
                sourceEntityID: sourceEntity.id,
                targetEntityID: selectedEntityID,
                relationship: relationship.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            await onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

