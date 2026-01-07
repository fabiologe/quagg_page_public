import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useEmailStore = defineStore('email', () => {
    // State
    const folders = ref([
        { id: 'inbox', name: 'Posteingang', icon: '📥', unread: 3 },
        { id: 'sent', name: 'Gesendet', icon: '📤', unread: 0 },
        { id: 'drafts', name: 'Entwürfe', icon: '📝', unread: 0 },
        { id: 'archive', name: 'Archiv', icon: '📦', unread: 0 },
        { id: 'projekt-a', name: 'Projekt A', icon: '📁', unread: 1 },
        { id: 'projekt-b', name: 'Projekt B', icon: '📁', unread: 0 }
    ])

    const emails = ref([
        {
            id: 1,
            folderId: 'inbox',
            from: 'Max Mustermann',
            fromEmail: 'max.mustermann@example.com',
            subject: 'Rückfrage zum Hydraulikgutachten',
            preview: 'Hallo Team, ich habe eine Frage zur aktuellen Berechnung...',
            date: new Date('2025-12-12T10:30:00'),
            read: false,
            hasAttachments: true,
            thread: [
                {
                    id: 't1-1',
                    from: 'Max Mustermann',
                    fromEmail: 'max.mustermann@example.com',
                    date: new Date('2025-12-12T10:30:00'),
                    content: 'Hallo Team,\n\nich habe eine Frage zur aktuellen Berechnung des Hydraulikgutachtens für Projekt A. Die Werte im Abschnitt 3.2 erscheinen mir etwas niedrig.\n\nKönnen wir das heute noch besprechen?\n\nBeste Grüße\nMax',
                    attachments: [
                        { id: 'a1', name: 'Gutachten_v3.pdf', size: 2456789, type: 'pdf' }
                    ]
                }
            ]
        },
        {
            id: 2,
            folderId: 'inbox',
            from: 'Anna Schmidt',
            fromEmail: 'a.schmidt@bauamt.de',
            subject: 'Genehmigung Entwässerungsplan',
            preview: 'Sehr geehrte Damen und Herren, anbei erhalten Sie die Genehmigung...',
            date: new Date('2025-12-11T14:22:00'),
            read: false,
            hasAttachments: true,
            thread: [
                {
                    id: 't2-1',
                    from: 'Anna Schmidt',
                    fromEmail: 'a.schmidt@bauamt.de',
                    date: new Date('2025-12-11T14:22:00'),
                    content: 'Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Genehmigung für den Entwässerungsplan. Bitte beachten Sie die Auflagen in Anlage 2.\n\nMit freundlichen Grüßen\nAnna Schmidt\nBauamt Stadt Musterstadt',
                    attachments: [
                        { id: 'a2', name: 'Genehmigung_2025-001.pdf', size: 1234567, type: 'pdf' },
                        { id: 'a3', name: 'Auflagen.pdf', size: 456789, type: 'pdf' }
                    ]
                }
            ]
        },
        {
            id: 3,
            folderId: 'inbox',
            from: 'Thomas Weber',
            fromEmail: 'thomas.weber@partner.de',
            subject: 'Meeting morgen 10 Uhr?',
            preview: 'Hi, können wir morgen um 10 Uhr das Projekt besprechen?',
            date: new Date('2025-12-10T16:45:00'),
            read: true,
            hasAttachments: false,
            thread: [
                {
                    id: 't3-1',
                    from: 'Thomas Weber',
                    fromEmail: 'thomas.weber@partner.de',
                    date: new Date('2025-12-10T16:45:00'),
                    content: 'Hi zusammen,\n\nkönnen wir morgen um 10 Uhr das Projekt besprechen? Ich habe ein paar Fragen zur Dimensionierung.\n\nGruß\nThomas',
                    attachments: []
                },
                {
                    id: 't3-2',
                    from: 'Sie',
                    fromEmail: 'office@quagg.de',
                    date: new Date('2025-12-10T17:12:00'),
                    content: 'Hi Thomas,\n\n10 Uhr passt perfekt. Schick mir vorher gerne deine Fragen, dann kann ich mich vorbereiten.\n\nBis morgen!',
                    attachments: []
                }
            ]
        },
        {
            id: 4,
            folderId: 'projekt-a',
            from: 'Lisa Müller',
            fromEmail: 'l.mueller@kunde.de',
            subject: 'RE: Angebot Versickerungsanlage',
            preview: 'Vielen Dank für das Angebot. Wir haben uns für Variante 2 entschieden...',
            date: new Date('2025-12-09T11:20:00'),
            read: false,
            hasAttachments: false,
            thread: [
                {
                    id: 't4-1',
                    from: 'Sie',
                    fromEmail: 'office@quagg.de',
                    date: new Date('2025-12-08T09:00:00'),
                    content: 'Sehr geehrte Frau Müller,\n\nanbei erhalten Sie unser Angebot für die Versickerungsanlage in zwei Varianten.\n\nMit freundlichen Grüßen',
                    attachments: []
                },
                {
                    id: 't4-2',
                    from: 'Lisa Müller',
                    fromEmail: 'l.mueller@kunde.de',
                    date: new Date('2025-12-09T11:20:00'),
                    content: 'Sehr geehrte Damen und Herren,\n\nvielen Dank für das Angebot. Wir haben uns für Variante 2 entschieden. Bitte senden Sie uns die Auftragsbestätigung zu.\n\nMit freundlichen Grüßen\nLisa Müller',
                    attachments: []
                }
            ]
        },
        {
            id: 5,
            folderId: 'sent',
            from: 'Sie',
            fromEmail: 'office@quagg.de',
            subject: 'Zwischenbericht Projekt B',
            preview: 'Sehr geehrter Herr Schmidt, anbei der Zwischenbericht...',
            date: new Date('2025-12-08T15:30:00'),
            read: true,
            hasAttachments: true,
            thread: [
                {
                    id: 't5-1',
                    from: 'Sie',
                    fromEmail: 'office@quagg.de',
                    date: new Date('2025-12-08T15:30:00'),
                    content: 'Sehr geehrter Herr Schmidt,\n\nanbei erhalten Sie den Zwischenbericht zum aktuellen Projektstand. Die wichtigsten Ergebnisse sind auf Seite 4 zusammengefasst.\n\nBei Rückfragen stehe ich gerne zur Verfügung.\n\nMit freundlichen Grüßen',
                    attachments: [
                        { id: 'a4', name: 'Zwischenbericht_ProjektB.pdf', size: 3456789, type: 'pdf' }
                    ]
                }
            ]
        },
        {
            id: 6,
            folderId: 'drafts',
            from: 'Sie',
            fromEmail: 'office@quagg.de',
            subject: 'ENTWURF: Nachfrage Planungsunterlagen',
            preview: 'Sehr geehrter Herr...',
            date: new Date('2025-12-12T09:15:00'),
            read: true,
            hasAttachments: false,
            thread: [
                {
                    id: 't6-1',
                    from: 'Sie',
                    fromEmail: 'office@quagg.de',
                    date: new Date('2025-12-12T09:15:00'),
                    content: 'Sehr geehrter Herr...\n\n[ENTWURF - noch nicht fertig]',
                    attachments: []
                }
            ]
        }
    ])

    const selectedFolder = ref('inbox')
    const selectedEmail = ref(null)
    const composerOpen = ref(false)
    const replyToEmail = ref(null)

    // Getters
    const currentFolderEmails = computed(() => {
        return emails.value
            .filter(email => email.folderId === selectedFolder.value)
            .sort((a, b) => b.date - a.date)
    })

    const unreadCount = computed(() => {
        return emails.value.filter(email => !email.read).length
    })

    const selectedEmailData = computed(() => {
        if (!selectedEmail.value) return null
        return emails.value.find(email => email.id === selectedEmail.value)
    })

    // Actions
    function selectFolder(folderId) {
        selectedFolder.value = folderId
        selectedEmail.value = null
    }

    function selectEmail(emailId) {
        selectedEmail.value = emailId
        markAsRead(emailId)
    }

    function markAsRead(emailId) {
        const email = emails.value.find(e => e.id === emailId)
        if (email && !email.read) {
            email.read = true
            // Update folder unread count
            const folder = folders.value.find(f => f.id === email.folderId)
            if (folder && folder.unread > 0) {
                folder.unread--
            }
        }
    }

    function sendReply(emailId, content) {
        const email = emails.value.find(e => e.id === emailId)
        if (email) {
            const newMessage = {
                id: `t${emailId}-${email.thread.length + 1}`,
                from: 'Sie',
                fromEmail: 'office@quagg.de',
                date: new Date(),
                content: content,
                attachments: []
            }
            email.thread.push(newMessage)

            // Move to sent if not already there
            if (email.folderId !== 'sent') {
                email.date = new Date()
            }
        }
        composerOpen.value = false
        replyToEmail.value = null
    }

    function deleteEmail(emailId) {
        const index = emails.value.findIndex(e => e.id === emailId)
        if (index > -1) {
            emails.value.splice(index, 1)
            selectedEmail.value = null
        }
    }

    function openComposer(emailId = null) {
        composerOpen.value = true
        replyToEmail.value = emailId
    }

    function closeComposer() {
        composerOpen.value = false
        replyToEmail.value = null
    }

    return {
        // State
        folders,
        emails,
        selectedFolder,
        selectedEmail,
        composerOpen,
        replyToEmail,

        // Getters
        currentFolderEmails,
        unreadCount,
        selectedEmailData,

        // Actions
        selectFolder,
        selectEmail,
        markAsRead,
        sendReply,
        deleteEmail,
        openComposer,
        closeComposer
    }
})
