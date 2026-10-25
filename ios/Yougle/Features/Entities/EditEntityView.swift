import SwiftUI

struct EditEntityView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var kind: String
    @State private var name: String
    @State private var description: String
    @State private var tags: String
    @State private var includesDate: Bool
    @State private var occurredAt: Date
    @State private var webLinks: [DraftWebLink]
    @State private var attributes: [DraftAttribute]
    @State private var isSaving = false
    @State private var errorMessage: String?

    let entityID: UUID
    let onSaved: () async -> Void

    init(entity: YougleEntity, webLinks: [EntityWebLink], onSaved: @escaping () async -> Void) {
        entityID = entity.id
        self.onSaved = onSaved
        _kind = State(initialValue: entity.kind)
        _name = State(initialValue: entity.name)
        _description = State(initialValue: entity.description)
        _tags = State(initialValue: entity.tags.joined(separator: ", "))
        _includesDate = State(initialValue: entity.occurredAt != nil)
        _occurredAt = State(initialValue: entity.occurredAt ?? Date())
        _webLinks = State(initialValue: webLinks.map {
            DraftWebLink(label: $0.label, url: $0.url.absoluteString)
        })
        _attributes = State(initialValue: entity.attributes.keys.sorted().map {
            DraftAttribute(key: $0, value: entity.attributes[$0] ?? "")
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("What is it?") {
                    TextField("Type", text: $kind)
                        .textInputAutocapitalization(.never)
                    TextField("Name", text: $name)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3...8)
                }

                Section("Organize") {
                    TextField("Tags, separated by commas", text: $tags)
                        .textInputAutocapitalization(.never)
                    Toggle("Include a date", isOn: $includesDate)
                    if includesDate {
                        DatePicker("Date", selection: $occurredAt)
                    }
                }

                Section("Custom details") {
                    ForEach($attributes) { $attribute in
                        HStack {
                            TextField("Name", text: $attribute.key)
                            TextField("Value", text: $attribute.value)
                        }
                    }
                    .onDelete { offsets in attributes.remove(atOffsets: offsets) }

                    Button("Add detail", systemImage: "plus") {
                        attributes.append(DraftAttribute())
                    }
                }

                Section("Web links") {
                    ForEach($webLinks) { $webLink in
                        VStack(alignment: .leading) {
                            TextField("Label (optional)", text: $webLink.label)
                            TextField("https://example.com", text: $webLink.url)
                                .keyboardType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                    }
                    .onDelete { offsets in webLinks.remove(atOffsets: offsets) }

                    Button("Add web link", systemImage: "link.badge.plus") {
                        webLinks.append(DraftWebLink())
                    }
                }
            }
            .navigationTitle("Edit entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || kind.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .alert("Couldn’t save changes", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "Unknown error")
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let parsedTags = tags.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let parsedWebLinks = webLinks.compactMap { link -> CreateWebLinkRequest? in
            let trimmed = link.url.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            let normalized = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
            return CreateWebLinkRequest(
                label: link.label.trimmingCharacters(in: .whitespacesAndNewlines),
                url: normalized
            )
        }
        var parsedAttributes: [String: String] = [:]
        for attribute in attributes {
            let key = attribute.key.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty else { continue }
            parsedAttributes[key] = attribute.value.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        do {
            _ = try await APIClient.shared.updateEntity(id: entityID, input: UpdateEntityRequest(
                kind: kind.trimmingCharacters(in: .whitespacesAndNewlines),
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                occurredAt: includesDate ? occurredAt : nil,
                tags: parsedTags,
                attributes: parsedAttributes,
                webLinks: parsedWebLinks
            ))
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

