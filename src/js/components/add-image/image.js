/*jshint esnext: true */
import React               from 'react';
import MaharaBaseComponent from '../base.js';
import Select2             from 'react-select2';
import {maharaServer}      from '../../state.js';

class ImageDetails extends MaharaBaseComponent {
    constructor(props) {
        super(props);
        var userTags = [];

        if (maharaServer.sync && maharaServer.sync.tags) {
            for (var i = 0; i < maharaServer.sync.tags.length; i++) {
                userTags.push(maharaServer.sync.tags[i].id);
            }
        }

        this.imageToEdit = props.imageToEdit;

        this.state = {
            userTags: userTags
        };
        this.changeTags = this.changeTags.bind(this);
        this.tags = this.props.imageToEdit.tags;
    }
    render() {
        var title = this.props.imageToEdit.title;
        var description = this.props.imageToEdit.description;
        var tags = this.props.imageToEdit.tags;

        return <div>
            <img src={this.props.imageToEdit.fileUrl} />
            <h2>Title</h2>
            <input ref="title" type="text" className="subject" defaultValue={title} />
            <h2>Description</h2>
            <textarea ref="textarea" className="body" defaultValue={description} />
            <h2>Tags</h2>
            <Select2
                multiple
                onChange={this.changeTags}
                ref="reactSelect2"
                data={this.state.userTags.concat(tags)}
                defaultValue={tags}
                options={
                    {
                        placeholder: this.gettext("tags_placeholder"),
                        width: '100%',
                        tags: true
                    }
                }
            />
        </div>;
    }
    changeTags(event) {
        var tagsObj = this.refs.reactSelect2.el.select2('data'),
            tags = [],
            i;

        for (i = 0; i < tagsObj.length; i++) {
            tags.push(tagsObj[i].text);
        }

        //console.log("new tags", tags);
        this.tags = tags; // parent component accesses it this way
    }
    componentDidMount() {
        var textarea = this.refs.textarea,
            saveButtonHeight = 100, //todo: approximate height most of the time
            textareaLayout = textarea.getBoundingClientRect(),
            newTextAreaHeight = window.innerHeight - textareaLayout.top - saveButtonHeight,
            minimumHeight = 50; // 50 (pixels) is about 2 lines of text on most screens. Feel free to tweak this.

        newTextAreaHeight = newTextAreaHeight < minimumHeight ? minimumHeight : newTextAreaHeight; //clamping the value to a minimum
        textarea.style.height = newTextAreaHeight + "px";
    }
}

export default ImageDetails;