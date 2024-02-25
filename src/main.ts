import { App, Editor, EditorPosition, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, resolveSubpath } from 'obsidian';
import { generateFlashcards } from "./flashcards";

interface FlashcardsSettings {
  apiKey: string;
  model: string;
  inlineSeparator: string;
}

const DEFAULT_SETTINGS: FlashcardsSettings = {
  apiKey: "",
  model: "text-davinci-003",
  inlineSeparator: "::"
};

export default class FlashcardsLLMPlugin extends Plugin {
  settings: FlashcardsSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-flashcards",
      name: "Generate Flashcards",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.onGenerateFlashcards(editor, view);
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new FlashcardsSettingsTab(this.app, this));
  }


  /**
   * Resolves a link to a file in the vault.
   * For example, if the link is `![[My Note#heading]]`, this function should return the content of the #heading section in the file My Note.
   * @param link - The link to resolve
   */
  async resolveLink(link: string): Promise<string|null> { 
    // split link by the very first #, if it exists
    const sharpIndex = link.indexOf("#");
    let filePath:string;
    let heading = "";
    if (sharpIndex > 0) {
      filePath = link.slice(0, sharpIndex);
      heading = link.slice(sharpIndex);
    } else {
      filePath = link;
    }
    const targetFile = this.app.metadataCache.getFirstLinkpathDest(filePath,heading)
    if (!targetFile) {
      return null;
    }
    const metadataCache = this.app.metadataCache.getFileCache(targetFile);
    if (!metadataCache) {
      return null;
    }
    const resolveResult = resolveSubpath(metadataCache, heading);

    if (!resolveResult) {
      return null;

    }

    const start = resolveResult.start;
    const end = resolveResult.end;
    // get the content of the resolved link by using the start and end position
    const content = await this.app.vault.cachedRead(targetFile);
    const resolvedLink = content.substring(start.offset, end?.offset);
    return resolvedLink;
    
  }

  async onGenerateFlashcards(editor: Editor, view: MarkdownView) {
    const apiKey = this.settings.apiKey;
    if (!apiKey) {
      new Notice("API key is not set in plugin settings");
      return;
    }

    const sep = this.settings.inlineSeparator
    const model = this.settings.model;

    const wholeText = editor.getValue()
    
    let currentText = (editor.somethingSelected() ? editor.getSelection() : wholeText)

    // resolve embedded preview links in text for every line, for example ![[link]] -> > linked content
    const embeddedPreviewRegex = /!\[\[(.*?)\]\]/g;
    const matches = currentText.match(embeddedPreviewRegex);
    if (matches) {
      for (const match of matches) {
        const link = match.slice(4, -2);
        let resolvedLink = await this.resolveLink(link);
        // add > to each line of resolved link
        if (!resolvedLink || resolvedLink === link) {
          continue;
        }
        resolvedLink = resolvedLink.trim().split("\n").map((s) => "> " + s).join("\n");
        resolvedLink = "\n> Linked content:\n" + resolvedLink + "\n";

        currentText = currentText.replace(match, resolvedLink);
      }
    }

    // Check if the header is already present
    const headerRegex = /\n\n### Generated Flashcards\n/;
    const hasHeader = headerRegex.test(wholeText);

    // Check if the #flashcards tag is already present
    const tagRegex = /\n#flashcards.*\n/;
    const hasTag = tagRegex.test(wholeText);


    new Notice("Generating flashcards...");
    try {
      const generatedCards = (await generateFlashcards(currentText, apiKey, model, sep)).split("\n");
      editor.setCursor(editor.lastLine())

      let updatedText = "";

      // Generate and add the header if not already present
      if (!hasHeader) {
        updatedText += "\n\n### Generated Flashcards\n";
      }

      // Generate and add the #flashcards tag if not already present
      if (!hasTag) {
        updatedText += "#flashcards\n";
      }

      updatedText += "\n\n" + generatedCards.map(s => s.trim()).join('\n\n');

      editor.replaceRange(updatedText, editor.getCursor())


      const newPosition: EditorPosition = {
        line: editor.lastLine()
      }
      editor.setCursor(newPosition)
      new Notice("Flashcards succesfully generated!");

    } catch (error) {
      console.error("Error generating flashcards:", error);
      new Notice("Error generating flashcards. Please check the plugin console for details.");
    }
  }

  onunload() {

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class FlashcardsSettingsTab extends PluginSettingTab {
  plugin: FlashcardsLLMPlugin;

  constructor(app: App, plugin: FlashcardsLLMPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h3", {text: "Model settings"})

    new Setting(containerEl)
    .setName("OpenAI API key")
    .setDesc("Enter your OpenAI API key")
    .addText((text) =>
      text
      .setPlaceholder("API key")
      .setValue(this.plugin.settings.apiKey)
      .onChange(async (value) => {
        this.plugin.settings.apiKey = value;
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
    .setName("Model")
    .setDesc("Which language model to use")
    .addDropdown((dropdown) =>
      dropdown
      .addOption("text-davinci-003", "text-davinci-003")
      .addOption("gpt-3.5-turbo", "gpt-3.5-turbo")
      .setValue(this.plugin.settings.model)
      .onChange(async (value) => {
        this.plugin.settings.model = value;
        await this.plugin.saveSettings();
      })
    );

    containerEl.createEl("h3", {text: "Preferences"})

    new Setting(containerEl)
    .setName("Separator for inline flashcards")
    .setDesc("Note that after changing this you have to manually edit any flashcards you already have")
    .addText((text) =>
      text
      .setPlaceholder("::")
      .setValue(this.plugin.settings.inlineSeparator)
      .onChange(async (value) => {
        this.plugin.settings.inlineSeparator = value;
        await this.plugin.saveSettings();
      })
    );


  }
}
