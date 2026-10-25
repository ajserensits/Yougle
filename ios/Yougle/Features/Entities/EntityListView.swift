import SwiftUI
import Observation

@Observable
final class EntityListModel {
    var entities: [YougleEntity] = []
    var isLoading = false
    var errorMessage: String?

    @MainActor
    func load(query: String = "") async {
        isLoading = true
        defer { isLoading = false }
        do {
            entities = try await APIClient.shared.searchEntities(query: query)
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct EntityListView: View {
    @State private var model = EntityListModel()
    @State private var navigationPath: [UUID] = []
    @State private var query = ""
    @State private var showingCreate = false

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if model.isLoading && model.entities.isEmpty {
                    ProgressView("Loading your things…")
                } else if model.entities.isEmpty {
                    ContentUnavailableView(
                        query.isEmpty ? "Nothing here yet" : "No matches",
                        systemImage: query.isEmpty ? "sparkles" : "magnifyingglass",
                        description: Text(query.isEmpty ? "Add a memory, place, person, medication, or anything else." : "Try a different name, description, or tag.")
                    )
                } else {
                    List(model.entities) { entity in
                        NavigationLink(value: entity.id) {
                            EntityRow(entity: entity)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Yougle")
            .navigationDestination(for: UUID.self) { id in
                EntityDetailView(
                    entityID: id,
                    onChanged: {
                        await model.load(query: query)
                    },
                    onDeleted: {
                        if navigationPath.last == id {
                            navigationPath.removeLast()
                        }
                        await model.load(query: query)
                    }
                )
            }
            .searchable(text: $query, prompt: "Search everything")
            .toolbar {
                Button("Add", systemImage: "plus") { showingCreate = true }
            }
            .sheet(isPresented: $showingCreate) {
                CreateEntityView {
                    await model.load(query: query)
                }
            }
            .task(id: query) {
                if !query.isEmpty {
                    try? await Task.sleep(for: .milliseconds(300))
                }
                guard !Task.isCancelled else { return }
                await model.load(query: query)
            }
            .refreshable { await model.load(query: query) }
            .alert("Couldn’t load", isPresented: .constant(model.errorMessage != nil)) {
                Button("OK") { model.errorMessage = nil }
            } message: {
                Text(model.errorMessage ?? "Unknown error")
            }
        }
    }
}

private struct EntityRow: View {
    let entity: YougleEntity

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(entity.name).font(.headline)
                Spacer()
                Text(entity.kind.capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if !entity.description.isEmpty {
                Text(entity.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if !entity.tags.isEmpty {
                Text(entity.tags.map { "#\($0)" }.joined(separator: "  "))
                    .font(.caption)
                    .foregroundStyle(.tint)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
}

